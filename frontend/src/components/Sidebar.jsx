import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import useAuthStore from '../store/authStore.js';
import './Sidebar.css';

const Sidebar = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const user = useAuthStore((state) => state.user);
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
    const [collapsed, setCollapsed] = useState(false);
    const [isMobileOpen, setIsMobileOpen] = useState(false);

    const menuItems = [
        {
            id: 'home',
            label: 'Home',
            icon: 'home',
            path: '/',
            description: 'Trang chủ'
        },
        {
            id: 'courses',
            label: 'Courses',
            icon: 'book',
            path: '/courses',
            description: 'Xem tất cả khóa học'
        },
        {
            id: 'my-courses',
            label: 'My Courses',
            icon: 'book-open',
            path: '/my-courses',
            description: 'Khóa học của tôi',
            requireAuth: true
        },
        {
            id: 'lessons',
            label: 'Lessons',
            icon: 'video',
            path: '/lessons',
            description: 'Bài học',
            requireAuth: true
        },
        {
            id: 'tests',
            label: 'Tests',
            icon: 'file-text',
            path: '/tests',
            description: 'Bài kiểm tra',
            requireAuth: true
        },
        {
            id: 'profile',
            label: 'Profile',
            icon: 'user',
            path: '/profile',
            description: 'Thông tin cá nhân',
            requireAuth: true
        }
    ];

    // Filter menu items based on authentication
    const visibleMenuItems = menuItems.filter(item => {
        if (item.requireAuth && !isAuthenticated) return false;
        return true;
    });

    const getIcon = (iconName) => {
        const icons = {
            home: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
            ),
            book: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
            ),
            'book-open': (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
            ),
            video: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
            ),
            'file-text': (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
            ),
            user: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
            )
        };
        return icons[iconName] || icons.home;
    };

    const handleNavigate = (path) => {
        navigate(path);
        setIsMobileOpen(false);
    };

    const normalizePath = (p) => p ? p.replace(/\/$/, '') : '';

    const isActive = (path) => {
        const loc = normalizePath(location.pathname);
        const target = normalizePath(path);
        if (target === '/' && (loc === '' || loc === '/')) return true;
        return loc === target;
    };

    const toggleCollapse = () => {
        const next = !collapsed;
        setCollapsed(next);
        try {
            window.dispatchEvent(new CustomEvent('sidebar:toggle', { detail: { collapsed: next } }));
        } catch (e) { }
    };

    return (
        <>
            {/* Overlay for mobile */}
            {isMobileOpen && (
                <div
                    className="sidebar-overlay"
                    onClick={() => setIsMobileOpen(false)}
                />
            )}

            {/* Sidebar */}
            <div className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''} ${isMobileOpen ? 'sidebar-mobile-open' : ''}`}>
                {/* Menu Items */}
                <nav className="sidebar-nav">
                    <div className="sidebar-menu">
                        {visibleMenuItems.map((item) => (
                            <div key={item.id} className="sidebar-menu-item-wrapper">
                                <button
                                    onClick={() => handleNavigate(item.path)}
                                    title={item.label}
                                    className={`sidebar-menu-item ${isActive(item.path) ? 'sidebar-menu-item-active' : ''}`}
                                >
                                    <div className={`sidebar-icon ${isActive(item.path) ? 'sidebar-icon-active' : ''}`}>
                                        {getIcon(item.icon)}
                                    </div>
                                    <div className={`sidebar-menu-content ${collapsed ? 'sidebar-menu-content-hidden' : ''}`}>
                                        <div className="sidebar-menu-label">{item.label}</div>
                                        <div className="sidebar-menu-description">
                                            {item.description}
                                        </div>
                                    </div>
                                </button>
                            </div>
                        ))}
                    </div>
                </nav>

                {/* Collapse button */}
                <button
                    onClick={toggleCollapse}
                    title={collapsed ? 'Mở rộng' : 'Thu gọn'}
                    className="sidebar-toggle-btn"
                    style={{ left: collapsed ? '3.5rem' : '19rem' }}
                    aria-label={collapsed ? 'Mở rộng' : 'Thu gọn'}
                >
                    <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        className={`sidebar-toggle-icon ${collapsed ? 'sidebar-toggle-icon-rotated' : ''}`}
                    >
                        <path d="M8.70710678,12 L19.5,12 C19.7761424,12 20,12.2238576 20,12.5 C20,12.7761424 19.7761424,13 19.5,13 L8.70710678,13 L11.8535534,16.1464466 C12.0488155,16.3417088 12.0488155,16.6582912 11.8535534,16.8535534 C11.6582912,17.0488155 11.3417088,17.0488155 11.1464466,16.8535534 L7.14644661,12.8535534 C6.95118446,12.6582912 6.95118446,12.3417088 7.14644661,12.1464466 L11.1464466,8.14644661 C11.3417088,7.95118446 11.6582912,7.95118446 11.8535534,8.14644661 C12.0488155,8.34170876 12.0488155,8.65829124 11.8535534,8.85355339 L8.70710678,12 L8.70710678,12 Z M4,5.5 C4,5.22385763 4.22385763,5 4.5,5 C4.77614237,5 5,5.22385763 5,5.5 L5,19.5 C5,19.7761424 4.77614237,20 4.5,20 C4.22385763,20 4,19.7761424 4,19.5 L4,5.5 Z" fill="currentColor" />
                    </svg>
                </button>
            </div>
        </>
    );
};

export default Sidebar;

